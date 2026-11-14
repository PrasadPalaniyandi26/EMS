import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { InvoicingService } from './invoicing.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

// Who sees what: Admin, Finance, Manager and Operations read. Admin, Finance and Operations add and edit POs and draft invoices.
// Only Admin and Finance issue or cancel an invoice, record payments and change the company details.
const READ = ['admin', 'finance', 'manager', 'operations'] as const;
const WRITE = ['admin', 'finance', 'operations'] as const;
const MONEY = ['admin', 'finance'] as const;

@ApiTags('invoicing')
@Controller('v1/company-profile')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompanyProfileController {
  constructor(private s: InvoicingService) {}
  @Get() @Roles(...READ) get() { return this.s.getCompany(); }
  @Put() @Roles(...MONEY) save(@Body() b: any, @CurrentUser() u: any) { return this.s.saveCompany(b, u); }
}

@ApiTags('invoicing')
@Controller('v1/client-pos')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ClientPosController {
  constructor(private s: InvoicingService) {}
  @Get() @Roles(...READ) list(@Query() q: any) { return this.s.listPos(q); }
  @Get(':id') @Roles(...READ) get(@Param('id', ParseIntPipe) id: number) { return this.s.getPo(id); }
  @Post() @Roles(...WRITE) create(@Body() b: any, @CurrentUser() u: any) { return this.s.createPo(b, u); }
  @Put(':id') @Roles(...WRITE) update(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: any) { return this.s.updatePo(id, b, u); }
  @Post(':id/close') @Roles(...WRITE) close(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.setPoStatus(id, 'close', u); }
  @Post(':id/reopen') @Roles(...WRITE) reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.setPoStatus(id, 'reopen', u); }
  @Post(':id/cancel') @Roles(...WRITE) cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.setPoStatus(id, 'cancel', u); }
  @Delete(':id') @Roles(...WRITE) remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.deletePo(id, u); }
}

@ApiTags('invoicing')
@Controller('v1/invoices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class InvoicesController {
  constructor(private s: InvoicingService) {}
  @Get() @Roles(...READ) list(@Query() q: any) { return this.s.listInvoices(q); }
  // Before :id, so "summary" is not read as an invoice number
  @Get('summary') @Roles(...READ) summary() { return this.s.summary(); }
  @Get(':id') @Roles(...READ) get(@Param('id', ParseIntPipe) id: number) { return this.s.getInvoice(id); }
  @Post() @Roles(...WRITE) create(@Body() b: any, @CurrentUser() u: any) { return this.s.createInvoice(b, u); }
  @Put(':id') @Roles(...WRITE) update(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: any) { return this.s.updateInvoice(id, b, u); }
  @Delete(':id') @Roles(...WRITE) remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.deleteInvoice(id, u); }
  @Post(':id/issue') @Roles(...MONEY) issue(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: any) { return this.s.issueInvoice(id, u); }
  @Post(':id/cancel') @Roles(...MONEY) cancel(@Param('id', ParseIntPipe) id: number, @Body('reason') reason: string, @CurrentUser() u: any) { return this.s.cancelInvoice(id, reason, u); }
  @Post(':id/payments') @Roles(...MONEY) pay(@Param('id', ParseIntPipe) id: number, @Body() b: any, @CurrentUser() u: any) { return this.s.addPayment(id, b, u); }
  @Delete(':id/payments/:pid') @Roles(...MONEY) unpay(@Param('id', ParseIntPipe) id: number, @Param('pid', ParseIntPipe) pid: number, @CurrentUser() u: any) { return this.s.removePayment(id, pid, u); }
}
