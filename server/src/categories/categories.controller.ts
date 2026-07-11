import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CategoriesService } from './categories.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('categories')
@Controller('v1/categories')
@UseGuards(AuthGuard('jwt'))
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  findAll(@Query('type') type?: string, @Query('includeInactive') includeInactive?: string) {
    const inactive = includeInactive === 'true';
    if (type) return this.service.findByType(type, inactive);
    return this.service.findAll(inactive);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
