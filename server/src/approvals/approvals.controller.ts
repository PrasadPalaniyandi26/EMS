import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseIntPipe, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApprovalsService } from './approvals.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('approvals')
@Controller('v1/approvals')
@UseGuards(AuthGuard('jwt'))
export class ApprovalsController {
  constructor(private service: ApprovalsService) {}

  @Get('pending')
  getPending(@CurrentUser() user: any) {
    return this.service.getPending(user.id, user.role_name);
  }

  @Get('history')
  getHistory(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.service.getHistory(user.id, user.role_name, status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body('comments') comments?: string,
    @Body('isClaimable') isClaimable?: boolean,
  ) {
    return this.service.approve(id, userId, comments, isClaimable);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body('comments') comments?: string,
  ) {
    return this.service.reject(id, userId, comments);
  }

  @Post(':id/send-back')
  @HttpCode(200)
  sendBack(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body('comments') comments?: string,
  ) {
    return this.service.sendBack(id, userId, comments);
  }
}
