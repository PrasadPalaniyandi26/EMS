import { Module } from '@nestjs/common';
import { ProjectCategoriesController, ProductCategoriesController } from './type-categories.controller';
import { TypeCategoriesService } from './type-categories.service';

@Module({
  controllers: [ProjectCategoriesController, ProductCategoriesController],
  providers: [TypeCategoriesService],
})
export class TypeCategoriesModule {}
