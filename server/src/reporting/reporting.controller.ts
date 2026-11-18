import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('reporting')
@Controller('v1/reporting')
@UseGuards(AuthGuard('jwt'))
export class ReportingController {
  constructor(private service: ReportingService) {}

  // The people whose records this user can report on, for the person filter; empty when it is only themselves
  @Get('people')
  people(@CurrentUser('id') userId: number, @CurrentUser('role_name') roleName: string) {
    return this.service.people(userId, roleName);
  }

  @Get('generate')
  generate(
    @CurrentUser('id') userId: number,
    @CurrentUser('role_name') roleName: string,
    @Query('type') type: string,
    @Query() params: Record<string, string>,
  ) {
    const { type: _t, ...rest } = params;
    return this.service.generate(userId, roleName, type, rest);
  }
}
