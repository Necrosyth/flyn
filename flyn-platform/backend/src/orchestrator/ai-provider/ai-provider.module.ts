import { Module } from '@nestjs/common';
import { AIProviderService } from './ai-provider.service';
import { UsageModule } from '../../usage/usage.module';

@Module({
    imports: [UsageModule],
    providers: [AIProviderService],
    exports: [AIProviderService],
})
export class AIProviderModule { }
