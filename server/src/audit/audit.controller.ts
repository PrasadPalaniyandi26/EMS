import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('audit')
@Controller('v1/audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private service: AuditService) {}

  @Get() findAll(@Query() query: any) { return this.service.findAll(query); }
}
