import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailModule } from '../mail/mail.module';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AssetsModule } from '../assets/assets.module';
import { AgentModule } from '../agents/agent.module';

@Module({
  imports: [FirebaseModule, MailModule, AssetsModule, AgentModule],
  controllers: [ChatbotController],
  providers: [ChatbotService, FirebaseAuthGuard],
})
export class ChatbotModule {}
