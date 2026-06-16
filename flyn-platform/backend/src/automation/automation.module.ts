import { Module, Global } from '@nestjs/common';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationController } from './automation.controller';

@Global()
@Module({
    controllers: [AutomationController],
    providers: [AutomationEngineService],
    exports: [AutomationEngineService],
})
export class AutomationModule {}
