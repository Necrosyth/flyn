import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EsimController } from './esim.controller';
import { EsimService } from './esim.service';

@Module({
  imports: [ConfigModule],
  controllers: [EsimController],
  providers: [EsimService],
  exports: [EsimService],
})
export class EsimModule {}
