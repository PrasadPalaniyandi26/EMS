import { Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: number, @Query() query: any) {
    return this.service.findAll(userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: number) {
    return this.service.getUnreadCount(userId);
  }

  @Patch('mark-read')
  markRead(@CurrentUser('id') userId: number, @Body() body: { ids: number[] }) {
    return this.service.markRead(userId, body.ids || []);
  }

  @Patch('mark-all-read')
  markAllRead(@CurrentUser('id') userId: number) {
    return this.service.markAllRead(userId);
  }

  @Delete('clear-all')
  clearAll(@CurrentUser('id') userId: number) {
    return this.service.clearAll(userId);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteNotification(userId, id);
  }
}
