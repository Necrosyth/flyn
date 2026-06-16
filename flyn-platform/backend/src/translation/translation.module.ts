import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TranslationController],
    providers: [TranslationService],
    exports: [TranslationService],
})
export class TranslationModule { }
