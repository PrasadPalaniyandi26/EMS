import { Module } from '@nestjs/common';
import { ProductsController, ProductTypesController } from './products.controller';
import { ProductsService } from './products.service';
@Module({ controllers: [ProductsController, ProductTypesController], providers: [ProductsService], exports: [ProductsService] })
export class ProductsModule {}
