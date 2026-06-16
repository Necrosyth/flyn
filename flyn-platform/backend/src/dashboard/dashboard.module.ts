import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
    imports: [TenantsModule, FirebaseModule],
    controllers: [DashboardController],
})
export class DashboardModule { }
