const { validationResult } = require("express-validator");
const Poll = require("../models/Poll");
const PollVote = require("../models/PollVote");
const ApiResponse = require("../utils/apiResponse");

function buildVoterKey(req, body = {}) {
  if (req.user && req.user._id) {
    return `u:${req.user._id.toString()}`;
  }
  const clientId = body.clientId || req.query?.clientId;
  if (!clientId || typeof clientId !== "string") return null;
  const trimmed = clientId.trim();
  if (trimmed.length < 10 || trimmed.length > 128) return null;
  return `c:${trimmed}`;
}

function isPollOpen(poll) {
  if (!poll.isActive) return false;
  if (poll.expiresAt && new Date(poll.expiresAt) <= new Date()) return false;
  return true;
}

function serializePoll(poll, extras = {}) {
  const obj = poll.toObject ? poll.toObject() : { ...poll };
  const opts = Array.isArray(obj.options) ? obj.options : [];
  const total = opts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
  const options = opts.map((o, i) => ({
    text: o.text,
    votes: o.votes || 0,
    index: i,
    percent: total > 0 ? Math.round(((o.votes || 0) / total) * 1000) / 10 : 0,
  }));
  return {
    ...obj,
    options,
    totalVotes: total,
    ...extras,
  };
}

const listActivePolls = async (req, res) => {
  try {
    const now = new Date();
    const polls = await Poll.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("createdBy", "firstName lastName")
      .lean();

    const voterKey = buildVoterKey(req, req.query);
    let votedMap = {};
    if (voterKey && polls.length) {
      const ids = polls.map((p) => p._id);
      const votes = await PollVote.find({
        poll: { $in: ids },
        voterKey,
      }).lean();
      votedMap = votes.reduce((acc, v) => {
        acc[v.poll.toString()] = v.optionIndex;
        return acc;
      }, {});
    }

    const data = polls.map((p) => {
      const total = (p.options || []).reduce(
        (s, o) => s + (Number(o.votes) || 0),
        0,
      );
      const options = (p.options || []).map((o, i) => ({
        text: o.text,
        votes: o.votes || 0,
        index: i,
        percent:
          total > 0
            ? Math.round(((o.votes || 0) / total) * 1000) / 10
            : 0,
      }));
      const pid = p._id.toString();
      return {
        ...p,
        options,
        totalVotes: total,
        hasVoted: votedMap[pid] !== undefined,
        selectedOptionIndex:
          votedMap[pid] !== undefined ? votedMap[pid] : null,
      };
    });

    return ApiResponse.success(res, data, "Polls retrieved successfully");
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to fetch polls",
      500,
    );
  }
};

const getPollById = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName",
    );
    if (!poll) return ApiResponse.error(res, "Poll not found", 404);

    const voterKey = buildVoterKey(req, { ...req.body, ...req.query });
    let hasVoted = false;
    let selectedOptionIndex = null;
    if (voterKey) {
      const existing = await PollVote.findOne({
        poll: poll._id,
        voterKey,
      }).lean();
      if (existing) {
        hasVoted = true;
        selectedOptionIndex = existing.optionIndex;
      }
    }

    return ApiResponse.success(
      res,
      serializePoll(poll, { hasVoted, selectedOptionIndex }),
      "Poll retrieved successfully",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to fetch poll",
      500,
    );
  }
};

const listAllPollsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all", search = "" } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    if (String(search || "").trim()) {
      const term = String(search).trim();
      query.title = { $regex: term, $options: "i" };
    }

    const [rows, totalCount] = await Promise.all([
      Poll.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("createdBy", "firstName lastName email")
        .lean(),
      Poll.countDocuments(query),
    ]);

    const data = rows.map((p) => {
      const total = (p.options || []).reduce(
        (s, o) => s + (Number(o.votes) || 0),
        0,
      );
      const options = (p.options || []).map((o, i) => ({
        text: o.text,
        votes: o.votes || 0,
        index: i,
        percent:
          total > 0
            ? Math.round(((o.votes || 0) / total) * 1000) / 10
            : 0,
      }));
      return { ...p, options, totalVotes: total };
    });

    return ApiResponse.success(
      res,
      {
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          hasMore: skip + rows.length < totalCount,
        },
      },
      "Polls retrieved successfully",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to fetch polls",
      500,
    );
  }
};

const createPoll = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, "Validation failed", 400, errors.array());
    }

    const { title, description, options, isActive, expiresAt } = req.body;
    const optionDocs = options
      .map((t) => ({
        text: String(t).trim(),
        votes: 0,
      }))
      .filter((o) => o.text.length > 0);
    if (optionDocs.length < 2) {
      return ApiResponse.error(res, "At least two non-empty options are required", 400);
    }

    const payload = {
      title: String(title).trim(),
      description: description != null ? String(description).trim() : "",
      options: optionDocs,
      isActive: isActive !== false,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user._id,
    };

    const created = await Poll.create(payload);
    const populated = await Poll.findById(created._id).populate(
      "createdBy",
      "firstName lastName",
    );
    return ApiResponse.created(
      res,
      serializePoll(populated),
      "Poll created successfully",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to create poll",
      500,
    );
  }
};

const updatePoll = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, "Validation failed", 400, errors.array());
    }

    const row = await Poll.findById(req.params.id);
    if (!row) return ApiResponse.error(res, "Poll not found", 404);

    const { title, description, options, isActive, expiresAt } = req.body;
    if (title != null) row.title = String(title).trim();
    if (description != null) row.description = String(description).trim();
    if (Array.isArray(options)) {
      const optionDocs = options
        .map((t) => ({
          text: String(t).trim(),
          votes: 0,
        }))
        .filter((o) => o.text.length > 0);
      if (optionDocs.length < 2) {
        return ApiResponse.error(res, "At least two non-empty options are required", 400);
      }
      row.options = optionDocs;
      await PollVote.deleteMany({ poll: row._id });
    }
    if (isActive !== undefined) row.isActive = !!isActive;
    if (expiresAt !== undefined) {
      row.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    await row.save();
    const populated = await Poll.findById(row._id).populate(
      "createdBy",
      "firstName lastName",
    );
    return ApiResponse.updated(
      res,
      serializePoll(populated),
      "Poll updated successfully",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to update poll",
      500,
    );
  }
};

const deletePoll = async (req, res) => {
  try {
    const row = await Poll.findByIdAndDelete(req.params.id);
    if (!row) return ApiResponse.error(res, "Poll not found", 404);
    await PollVote.deleteMany({ poll: req.params.id });
    return ApiResponse.deleted(res, "Poll deleted successfully");
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to delete poll",
      500,
    );
  }
};

const votePoll = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, "Validation failed", 400, errors.array());
    }

    const voterKey = buildVoterKey(req, req.body);
    if (!voterKey) {
      return ApiResponse.error(
        res,
        "Sign in or provide clientId (from device) to vote",
        400,
      );
    }

    const poll = await Poll.findById(req.params.id);
    if (!poll) return ApiResponse.error(res, "Poll not found", 404);
    if (!isPollOpen(poll)) {
      return ApiResponse.error(res, "This poll is closed or expired", 400);
    }

    const optionIndex = parseInt(req.body.optionIndex, 10);
    if (
      Number.isNaN(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= poll.options.length
    ) {
      return ApiResponse.error(res, "Invalid option", 400);
    }

    try {
      await PollVote.create({
        poll: poll._id,
        optionIndex,
        voterKey,
      });
    } catch (e) {
      if (e.code === 11000) {
        return ApiResponse.error(res, "You have already voted on this poll", 400);
      }
      throw e;
    }

    const incPath = `options.${optionIndex}.votes`;
    await Poll.updateOne({ _id: poll._id }, { $inc: { [incPath]: 1 } });

    const updated = await Poll.findById(poll._id).populate(
      "createdBy",
      "firstName lastName",
    );
    return ApiResponse.success(
      res,
      serializePoll(updated, {
        hasVoted: true,
        selectedOptionIndex: optionIndex,
      }),
      "Vote recorded",
    );
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || "Failed to vote",
      500,
    );
  }
};

module.exports = {
  listActivePolls,
  getPollById,
  listAllPollsAdmin,
  createPoll,
  updatePoll,
  deletePoll,
  votePoll,
};
