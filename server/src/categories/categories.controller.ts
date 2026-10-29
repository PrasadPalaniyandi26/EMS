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

  @Get('usage')
  usage(@Query('kind') kind: string) { return this.service.usage(kind); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}

// The groups categories sit under: Type > Category
@ApiTags('category-types')
@Controller('v1/category-types')
@UseGuards(AuthGuard('jwt'))
export class CategoryTypesController {
  constructor(private service: CategoriesService) {}

  @Get() findAll(@Query('kind') kind?: string) { return this.service.findTypes(kind); }
  @Post() @UseGuards(RolesGuard) @Roles('admin')
  create(@Body() body: any, @CurrentUser('id') userId: number) { return this.service.createType({ ...body, createdBy: userId }); }
  @Put(':id') @UseGuards(RolesGuard) @Roles('admin')
  rename(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) { return this.service.renameType(id, name); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.deleteType(id); }
}
