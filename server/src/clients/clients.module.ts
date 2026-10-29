import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientSectorsController } from './client-sectors.controller';
import { ClientSectorsService } from './client-sectors.service';
@Module({
  controllers: [ClientsController, ClientSectorsController],
  providers: [ClientsService, ClientSectorsService],
  exports: [ClientsService],
})
export class ClientsModule {}
