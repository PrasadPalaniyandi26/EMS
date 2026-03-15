import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('v1/projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectsController {
  constructor(private service: ProjectsService) {}

  @Get() findAll(@Query('clientId') clientId?: number, @Query('typeId') typeId?: number) {
    return this.service.findAll({ clientId, typeId });
  }
  @Post() create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.create({ ...body, createdBy: userId });
  }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.update(id, body); }
  @Delete(':id') delete(@Param('id', ParseIntPipe) id: number) { return this.service.delete(id); }
}

@Controller('v1/project-types')
@UseGuards(AuthGuard('jwt'))
export class ProjectTypesController {
  constructor(private service: ProjectsService) {}

  @Get() findAll(@Query('clientId') clientId?: number) { return this.service.findAllTypes({ clientId }); }
  @Post() create(@Body() body: any, @CurrentUser('id') userId: number) {
    return this.service.createType({ ...body, createdBy: userId });
  }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.service.updateType(id, body); }
  @Delete(':id') delete(@Param('id', ParseIntPipe) id: number) { return this.service.deleteType(id); }
}
