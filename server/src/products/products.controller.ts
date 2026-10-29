import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('products')
@Controller('v1/products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Get() findAll(@Query('clientId') clientId?: number, @Query('typeId') typeId?: number) {
    return this.service.findAll({ clientId, typeId });
  }
  @Post() @UseGuards(RolesGuard) @Roles('manager', 'admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }
  @Put(':id') @UseGuards(RolesGuard) @Roles('manager', 'admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.update(id, body); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('manager', 'admin')
  delete(@Param('id', ParseIntPipe) id: number) { return this.service.delete(id); }
}

@Controller('v1/product-types')
@UseGuards(AuthGuard('jwt'))
export class ProductTypesController {
  constructor(private service: ProductsService) {}

  @Get() findAll(@Query('clientId') clientId?: number) { return this.service.findAllTypes({ clientId }); }
  @Post() @UseGuards(RolesGuard) @Roles('admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.createType({ ...body, createdBy: userId });
  }
  @Put(':id') @UseGuards(RolesGuard) @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.updateType(id, body); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('admin')
  delete(@Param('id', ParseIntPipe) id: number) { return this.service.deleteType(id); }
}
