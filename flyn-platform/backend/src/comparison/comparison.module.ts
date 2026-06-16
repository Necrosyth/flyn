import { Module } from '@nestjs/common';
import { ComparisonController } from './comparison.controller';

/** Comparison page content (FirebaseModule is @Global, so FirebaseService is available). */
@Module({
  controllers: [ComparisonController],
})
export class ComparisonModule {}
