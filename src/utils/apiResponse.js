class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }

  static success(res, data, message = "Success", statusCode = 200) {
    return res
      .status(statusCode)
      .json(new ApiResponse(statusCode, data, message));
  }

  static error(
    res,
    message = "Internal Server Error",
    statusCode = 500,
    data = null,
  ) {
    return res.status(statusCode).json({
      statusCode,
      success: false,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created(res, data, message = "Resource created successfully") {
    return this.success(res, data, message, 201);
  }

  static updated(res, data, message = "Resource updated successfully") {
    return this.success(res, data, message, 200);
  }

  static deleted(res, message = "Resource deleted successfully") {
    return this.success(res, null, message, 200);
  }

  static paginated(res, data, pagination, message = "Success") {
    return res.status(200).json({
      statusCode: 200,
      success: true,
      message,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = ApiResponse;
