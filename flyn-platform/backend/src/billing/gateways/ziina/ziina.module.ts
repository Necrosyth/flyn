import { Module } from '@nestjs/common';
import { ZiinaService } from './ziina.service';

@Module({
  providers: [ZiinaService],
  exports: [ZiinaService],
})
export class ZiinaModule {}
