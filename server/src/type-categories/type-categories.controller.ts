import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { TypeCategoriesService } from './type-categories.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('project-categories')
@Controller('v1/project-categories')
@UseGuards(AuthGuard('jwt'))
export class ProjectCategoriesController {
  constructor(private service: TypeCategoriesService) {}

  @Get() findAll(@Query('typeId') typeId?: number) { return this.service.findAll('project', typeId); }
  @Get('usage') usage() { return this.service.usage('project'); }
  @Post() @UseGuards(RolesGuard) @Roles('admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.create('project', { ...body, createdBy: userId }); }
  @Put(':id') @UseGuards(RolesGuard) @Roles('admin')
  rename(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) { return this.service.rename('project', id, name); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove('project', id); }
}

@ApiTags('product-categories')
@Controller('v1/product-categories')
@UseGuards(AuthGuard('jwt'))
export class ProductCategoriesController {
  constructor(private service: TypeCategoriesService) {}

  @Get() findAll(@Query('typeId') typeId?: number) { return this.service.findAll('product', typeId); }
  @Get('usage') usage() { return this.service.usage('product'); }
  @Post() @UseGuards(RolesGuard) @Roles('admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.create('product', { ...body, createdBy: userId }); }
  @Put(':id') @UseGuards(RolesGuard) @Roles('admin')
  rename(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) { return this.service.rename('product', id, name); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove('product', id); }
}
