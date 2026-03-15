import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';
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

  @Get(':id/splits')
  getSplits(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSplits(id);
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

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.delete(id, userId);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body('ids') ids: number[], @CurrentUser('id') userId: number) {
    return this.service.bulkDelete(ids, userId);
  }

  @Post(':id/split')
  split(@Param('id', ParseIntPipe) id: number, @Body('splits') splits: any[]) {
    return this.service.split(id, splits);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.submit(id, userId);
  }
}
