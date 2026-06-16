import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TranslationService } from './translation.service';

@Controller('translation')
export class TranslationController {
    constructor(private readonly translationService: TranslationService) { }

    @Post('translate')
    async translate(@Body() body: { texts: string[]; targetLang: string }) {
        const { texts, targetLang } = body;
        const translatedTexts = await this.translationService.translate(texts, targetLang);
        return { translations: translatedTexts };
    }
}
