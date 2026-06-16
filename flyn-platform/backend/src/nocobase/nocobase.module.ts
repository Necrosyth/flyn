import { Global, Module } from '@nestjs/common';
import { NocoBaseService } from './nocobase.service';

@Global()
@Module({
    providers: [NocoBaseService],
    exports: [NocoBaseService],
})
export class NocoBaseModule {}
