import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TranslationService {
    private readonly logger = new Logger(TranslationService.name);
    private readonly apiKey: string;
    private readonly apiUrl = 'https://translation.googleapis.com/language/translate/v2';

    // Google Translate API limits
    // 30k codepoints per request (Advanced), but let's stay safer with 20k
    // 128 strings per request (Basic is 128, Advanced is 1024, let's stick to 128 to be safe)
    private readonly MAX_CHARS_PER_REQUEST = 20000;
    private readonly MAX_STRINGS_PER_REQUEST = 128;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.apiKey = this.configService.get<string>('GOOGLE_TRANSLATE_API_KEY') || this.configService.get<string>('GOOGLE_KEY');
        if (!this.apiKey) {
            this.logger.warn('GOOGLE_TRANSLATE_API_KEY or GOOGLE_KEY is not set. Translation will fail.');
        }
    }

    async translate(texts: string[], targetLang: string): Promise<string[]> {
        if (!this.apiKey) {
            throw new Error('Google Translate API Key is missing');
        }

        if (texts.length === 0) return [];

        const chunks = this.chunkTexts(texts);
        const results: string[] = new Array(texts.length);

        // Process chunks
        let currentIndex = 0;

        // We process sequentially to avoid hitting rate limits too hard, 
        // though parallel could be faster. For now, sequential is safer.
        for (const chunk of chunks) {
            try {
                const translatedChunk = await this.translateBatch(chunk, targetLang);

                // Place results back in correct order
                for (let i = 0; i < translatedChunk.length; i++) {
                    results[currentIndex + i] = translatedChunk[i];
                }

                currentIndex += chunk.length;
            } catch (error) {
                this.logger.error(`Failed to translate chunk: ${error.message}`, error.stack);
                throw error;
            }
        }

        return results;
    }

    private chunkTexts(texts: string[]): string[][] {
        const chunks: string[][] = [];
        let currentChunk: string[] = [];
        let currentChunkSize = 0;

        for (const text of texts) {
            // If adding this text would exceed limits, push current chunk and start new
            if (
                currentChunk.length >= this.MAX_STRINGS_PER_REQUEST ||
                currentChunkSize + text.length > this.MAX_CHARS_PER_REQUEST
            ) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentChunkSize = 0;
                }
            }

            // If a single text is too large, we might need to handle it (unlikely for UI strings)
            // For now, we assume individual UI strings are < 20k chars

            currentChunk.push(text);
            currentChunkSize += text.length;
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private async translateBatch(texts: string[], targetLang: string): Promise<string[]> {
        try {
            // Google Translate API v2 format
            // POST https://translation.googleapis.com/language/translate/v2
            // q: string[]
            // target: string
            // key: string
            // format: 'text'

            const response = await firstValueFrom(
                this.httpService.post(
                    this.apiUrl,
                    {
                        q: texts,
                        target: targetLang,
                        format: 'text',
                    },
                    {
                        params: {
                            key: this.apiKey,
                        },
                    },
                ),
            );

            const translations = response.data?.data?.translations;

            if (!translations || !Array.isArray(translations)) {
                throw new Error('Invalid response from Google Translate API');
            }

            return translations.map((t: any) => t.translatedText);
        } catch (error) {
            // Log detailed error from axios
            if (error.response) {
                this.logger.error(
                    `Google API Error: ${JSON.stringify(error.response.data)}`
                );
            }
            throw error;
        }
    }
}
