import Constants from 'expo-constants';

// Get environment variables from app.config.js or app.json
const key = Constants.expoConfig?.extra?.AZURE_TRANSLATOR_KEY;
const region = Constants.expoConfig?.extra?.AZURE_TRANSLATOR_REGION;

if (!key || !region) {
  console.error('Azure Translator credentials are not properly configured. Please check your app.config.js or app.json file.');
}

const endpoint = `https://api.cognitive.microsofttranslator.com`;

// Generate a random UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const translateText = async (text: string, targetLanguage: string) => {
  if (!key || !region) {
    throw new Error('Azure Translator credentials are not properly configured');
  }

  try {
    const response = await fetch(`${endpoint}/translate?api-version=3.0&to=${targetLanguage}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-type': 'application/json',
        'X-ClientTraceId': generateUUID(),
      },
      body: JSON.stringify([{ text }]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Translation API error:', errorText);
      throw new Error(`Translation failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data[0] || !data[0].translations || !data[0].translations[0]) {
      throw new Error('Invalid translation response format');
    }
    return data[0].translations[0].text;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
};

// Common language codes
export const LANGUAGES = {
  ENGLISH: 'en',
  SPANISH: 'es',
  FRENCH: 'fr',
  GERMAN: 'de',
  ITALIAN: 'it',
  PORTUGUESE: 'pt',
  RUSSIAN: 'ru',
  JAPANESE: 'ja',
  KOREAN: 'ko',
  CHINESE: 'zh',
  ARABIC: 'ar',
  HINDI: 'hi',
  URDU: 'ur',
} as const;

export type LanguageCode = typeof LANGUAGES[keyof typeof LANGUAGES]; 