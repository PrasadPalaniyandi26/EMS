import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('products')
@Controller('v1/products')
@UseGuards(AuthGuard('jwt'))
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Get() findAll(@Query('clientId') clientId?: number, @Query('typeId') typeId?: number) {
    return this.service.findAll({ clientId, typeId });
  }
  @Post() create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.update(id, body); }
  @Delete(':id') delete(@Param('id', ParseIntPipe) id: number) { return this.service.delete(id); }
}

@Controller('v1/product-types')
@UseGuards(AuthGuard('jwt'))
export class ProductTypesController {
  constructor(private service: ProductsService) {}

  @Get() findAll(@Query('clientId') clientId?: number) { return this.service.findAllTypes({ clientId }); }
  @Post() create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.createType({ ...body, createdBy: userId });
  }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.updateType(id, body); }
  @Delete(':id') delete(@Param('id', ParseIntPipe) id: number) { return this.service.deleteType(id); }
}
