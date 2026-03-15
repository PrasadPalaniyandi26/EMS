import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecurringService } from './recurring.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('recurring')
@Controller('v1/recurring')
@UseGuards(AuthGuard('jwt'))
export class RecurringController {
  constructor(private service: RecurringService) {}

  @Get() findAll(@CurrentUser('id') userId: number) { return this.service.findAll(userId); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.findById(userId, id);
  }
  @Post() create(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.create(userId, body); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.update(userId, id, body);
  }
  @Delete(':id') delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.delete(userId, id);
  }
  @Post('run-check') runCheck() { return this.service.processDue(); }
}
