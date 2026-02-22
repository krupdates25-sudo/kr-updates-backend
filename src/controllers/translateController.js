const { translate } = require('google-translate-api-x');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/apiResponse');
const { AppError } = require('../utils/appError');

const translateText = catchAsync(async (req, res, next) => {
    const { text, targetLanguage = 'en' } = req.body;

    if (!text) {
        return next(new AppError('Text to translate is required', 400));
    }

    try {
        const resTranslation = await translate(text, { to: targetLanguage });

        ApiResponse.success(res, {
            originalText: text,
            translatedText: resTranslation.text,
            from: resTranslation.from.language.iso,
            to: targetLanguage
        }, 'Translation successful');
    } catch (error) {
        console.error('Translation error:', error);
        return next(new AppError('Translation failed. Please try again later.', 500));
    }
});

module.exports = {
    translateText
};
