import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ReceiptsController } from './receipts.controller';
@Module({
  imports: [MulterModule.register({ dest: './uploads' })],
  controllers: [ReceiptsController],
})
export class ReceiptsModule {}
