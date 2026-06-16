import { Body, Controller, Post } from '@nestjs/common';
import { AuthMailService } from './auth-mail.service';
import { Public } from '../billing/guards/public.decorator';

@Controller('api/auth')
export class AuthMailController {
  constructor(private readonly authMail: AuthMailService) {}

  /** Send verification email — called from frontend after account creation or resend */
  @Public()
  @Post('send-verification-email')
  async sendVerification(@Body() body: { idToken: string }) {
    return this.authMail.sendVerificationEmail(body.idToken);
  }

  /** Send password reset email — public endpoint, accepts email address */
  @Public()
  @Post('send-password-reset')
  async sendPasswordReset(@Body() body: { email: string }) {
    return this.authMail.sendPasswordResetEmail(body.email);
  }
}
