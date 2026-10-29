import { Module } from '@nestjs/common';
import { CategoriesController, CategoryTypesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({ controllers: [CategoriesController, CategoryTypesController], providers: [CategoriesService], exports: [CategoriesService] })
export class CategoriesModule {}
