import { Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.service.findAll(req.user.userId, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: any) {
    return this.service.getUnreadCount(req.user.userId);
  }

  @Patch('mark-read')
  markRead(@Req() req: any, @Body() body: { ids: number[] }) {
    return this.service.markRead(req.user.userId, body.ids || []);
  }

  @Patch('mark-all-read')
  markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.user.userId);
  }

  @Delete('clear-all')
  clearAll(@Req() req: any) {
    return this.service.clearAll(req.user.userId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteNotification(req.user.userId, id);
  }
}
