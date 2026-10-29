import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe, ParseFloatPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BudgetsService } from './budgets.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('budgets')
@Controller('v1/budgets')
@UseGuards(AuthGuard('jwt'))
export class BudgetsController {
  constructor(private service: BudgetsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: number, @Query('month') month?: string, @Query('year') year?: string) {
    return this.service.findAll(userId, { month, year });
  }

  @Get('status')
  getStatus(@CurrentUser('id') userId: number, @Query('month') month: string, @Query('year') year: string) {
    return this.service.getStatus(userId, Number(month), Number(year));
  }

  @Get('summary')
  getSummary(@CurrentUser('id') userId: number, @Query('month') month: string, @Query('year') year: string) {
    return this.service.getSummary(userId, Number(month), Number(year));
  }

  @Get('check')
  checkBudget(
    @CurrentUser('id') userId: number,
    @Query('categoryId', ParseIntPipe) categoryId: number,
    @Query('amount', ParseFloatPipe) amount: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.service.checkBudget(userId, categoryId, amount, month, year);
  }

  @Get('monthly-settings')
  getMonthlySettings(@CurrentUser('id') userId: number, @Query('month') month: string, @Query('year') year: string) {
    return this.service.getMonthlySettings(userId, Number(month), Number(year));
  }

  @Post()
  create(@Body() body: CreateBudgetDto, @CurrentUser('id') userId: number) {
    return this.service.create(userId, body);
  }

  @Post('monthly-settings')
  saveMonthlySettings(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.saveMonthlySettings(userId, body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateBudgetDto, @CurrentUser('id') userId: number) {
    return this.service.update(id, userId, body);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.delete(id, userId);
  }
}
