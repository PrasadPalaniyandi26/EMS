import { Module } from '@nestjs/common';
import { ProjectsController, ProjectTypesController } from './projects.controller';
import { ProjectsService } from './projects.service';
@Module({ controllers: [ProjectsController, ProjectTypesController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
