import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://pjpmzvu7wn.us-east-1.awsapprunner.com';

export const translationService = {
    translate: async (texts: string[], targetLang: string): Promise<string[]> => {
        const response = await axios.post(`${API_URL}/api/translation/translate`, {
            texts,
            targetLang,
        });
        return response.data.translations;
    },
};
