import { Global, Module } from '@nestjs/common';
import { ApiSpecService } from './api-spec.service';
import { ApiSpecController } from './api-spec.controller';

@Global()
@Module({
  controllers: [ApiSpecController],
  providers: [ApiSpecService],
  exports: [ApiSpecService],
})
export class ApiSpecModule {}
