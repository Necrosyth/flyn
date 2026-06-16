import { Module } from '@nestjs/common';
import { FreelancerService } from './freelancer.service';
import { FreelancerExecutor } from './freelancer.executor';
import { FreelancerController } from './freelancer.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
    imports: [AccountingModule],
    controllers: [FreelancerController],
    providers: [FreelancerService, FreelancerExecutor],
    exports: [FreelancerService, FreelancerExecutor],
})
export class FreelancerModule { }
