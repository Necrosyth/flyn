import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { RolesGuard } from '../billing/guards/roles.guard';
import { Roles } from '../billing/guards/roles.decorator';
import { WalletBalance, WalletTransaction } from './wallet.service';

@Controller('wallet')
@UseGuards(ApiOrFirebaseAuthGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /api/wallet/balance
   * Returns the user's current wallet balance
   */
  @Get('balance')
  async getBalance(@Req() req: AuthRequest): Promise<WalletBalance> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.walletService.getBalance(tenantId);
  }

  /**
   * GET /api/wallet/transactions
   * Returns paginated transaction history
   * Query params: limit (default 50)
   */
  @Get('transactions')
  async getTransactions(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ): Promise<{ transactions: WalletTransaction[]; nextStartAfter?: string }> {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.walletService.getTransactions(tenantId, parsedLimit);
  }

  /**
   * POST /api/wallet/admin/credit
   * Owner-only: deposit credits into any tenant's wallet
   */
  @Post('admin/credit')
  @UseGuards(ApiOrFirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  @HttpCode(200)
  async adminCredit(
    @Body() body: { tenantId: string; amount: number; description?: string },
  ): Promise<{ tenantId: string; newBalance: number }> {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    if (!body.amount || body.amount <= 0) throw new BadRequestException('amount must be positive');

    await this.walletService.credit(
      body.tenantId,
      body.amount,
      body.description || 'Manual admin credit',
      'manual',
    );

    const wallet = await this.walletService.getBalance(body.tenantId);
    this.logger.log(`Admin credited ${body.amount} to tenant ${body.tenantId}`);
    return { tenantId: body.tenantId, newBalance: wallet.balance };
  }
}
