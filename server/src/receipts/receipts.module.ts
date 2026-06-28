import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
@Module({
  imports: [MulterModule.register({ dest: './uploads' })],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
