import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe, HttpCode, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { TransactionsService } from './transactions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateTransactionDto, UpdateTransactionDto, ProcessReimbursementDto, BulkProcessReimbursementDto } from './dto/transaction.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('transactions')
@Controller('v1/transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: number, @Query() query: any) {
    return this.service.findAll(userId, query);
  }

  @Get('reimbursements')
  @UseGuards(RolesGuard)
  @Roles('finance', 'admin')
  getReimbursementQueue(@Query() query: any) {
    return this.service.getReimbursementQueue(query);
  }

  @Post('bulk-reimburse')
  @HttpCode(200)
  bulkMarkReimbursed(@Body() dto: BulkProcessReimbursementDto, @CurrentUser('id') userId: number) {
    return this.service.bulkMarkReimbursed(dto.ids, userId, dto);
  }

  @Get('export')
  async exportCsv(@CurrentUser('id') userId: number, @Query() query: any, @Res() res: Response) {
    const csv = await this.service.exportCsv(userId, query);
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${date}.csv"`);
    res.send(csv);
  }

  @Get(':id/splits')
  getSplits(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.getSplits(id, userId);
  }

  @Get(':id/approval-trail')
  getApprovalTrail(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.getApprovalTrail(id, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.findById(id, userId);
  }

  @Post()
  create(@Body() body: CreateTransactionDto, @CurrentUser('id') userId: number) {
    return this.service.create(userId, body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateTransactionDto, @CurrentUser('id') userId: number) {
    return this.service.update(id, userId, body);
  }

  @Delete('notes/:noteId')
  deleteNote(@Param('noteId', ParseIntPipe) noteId: number, @CurrentUser('id') userId: number) {
    return this.service.deleteNote(noteId, userId);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.delete(id, userId);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body('ids') ids: number[], @CurrentUser('id') userId: number) {
    return this.service.bulkDelete(ids, userId);
  }

  @Post('check-duplicates')
  @HttpCode(200)
  checkDuplicates(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.checkDuplicates(userId, body);
  }

  @Post(':id/split')
  split(@Param('id', ParseIntPipe) id: number, @Body('splits') splits: any[], @CurrentUser('id') userId: number) {
    return this.service.split(id, splits, userId);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.submit(id, userId);
  }

  @Post(':id/duplicate')
  @HttpCode(201)
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.duplicate(id, userId);
  }

  @Post(':id/void')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('finance', 'admin')
  void(@Param('id', ParseIntPipe) id: number, @Body('reason') reason: string, @CurrentUser('id') userId: number) {
    return this.service.void(id, userId, reason);
  }

  @Get(':id/notes')
  getNotes(@Param('id', ParseIntPipe) id: number) {
    return this.service.getNotes(id);
  }

  @Post(':id/notes')
  @HttpCode(201)
  addNote(@Param('id', ParseIntPipe) id: number, @Body('note') note: string, @CurrentUser('id') userId: number) {
    return this.service.addNote(id, userId, note);
  }

  @Post(':id/reimburse')
  @HttpCode(200)
  markReimbursed(@Param('id', ParseIntPipe) id: number, @Body() dto: ProcessReimbursementDto, @CurrentUser('id') userId: number) {
    return this.service.markReimbursed(id, userId, dto);
  }
}
