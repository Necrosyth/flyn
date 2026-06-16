import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import hi from './locales/hi.json';
import es from './locales/es.json';
import { flattenObject, unflattenObject, extractValues, reconstructFlattened } from '@/utils/json-helpers';
import { translationService } from '@/services/translationService';

export const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', label: 'Português', flag: '🇵🇹' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
] as const;

// Initialize with English
const resources = {
    en: { translation: en },
    hi: { translation: hi },
    es: { translation: es },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'flyn_language',
            caches: ['localStorage'],
        },
    });

export const loadLanguage = async (lang: string) => {
    if (i18n.hasResourceBundle(lang, 'translation')) {
        return;
    }

    try {
        // Flatten English source to get keys and values
        // We use 'en' as the source for all translations
        const flattenedEn = flattenObject(en);
        const keys = Object.keys(flattenedEn);
        const sourceValues = extractValues(flattenedEn);

        // Call backend to translate values
        const translatedValues = await translationService.translate(sourceValues, lang);

        // Reconstruct object with original structure and translated values
        const flattenedTranslated = reconstructFlattened(keys, translatedValues);
        const translatedResource = unflattenObject(flattenedTranslated);

        i18n.addResourceBundle(lang, 'translation', translatedResource, true, true);
    } catch (error) {
        console.error(`Failed to load language ${lang}:`, error);
        // Fallback or error handling could go here
    }
};

export default i18n;
