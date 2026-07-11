import { Controller, Post, Get, Param, Res, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import type { Response, Request } from 'express';
import { join, extname, resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { ApiTags } from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';

const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

// Add new storage folders here as the app grows
const STORAGE_FOLDERS = ['Receipts', 'Invoices', 'Documents', 'Images'];

STORAGE_FOLDERS.forEach((folder) => mkdirSync(join(baseDir, folder), { recursive: true }));

const receiptsDir = join(baseDir, 'Receipts');
const invoicesDir = join(baseDir, 'Invoices');

@ApiTags('receipts')
@Controller('v1/receipts')
@UseGuards(AuthGuard('jwt'))
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: (req: any, _file, cb) => {
          // ?type=invoice → Invoices folder; default → Receipts folder
          const folder = req.query?.type === 'invoice' ? invoicesDir : receiptsDir;
          cb(null, folder);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  upload(@UploadedFile() file: any, @Query('type') type?: string) {
    if (!file) return { error: 'No file uploaded or file type not allowed.' };
    return { filename: file.filename, originalName: file.originalname, size: file.size, folder: type === 'invoice' ? 'Invoices' : 'Receipts' };
  }

  @Post('ocr')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  async ocr(@UploadedFile() file: any) {
    if (!file) return { amount: null, date: null, paymentMethod: null, referenceNo: null, description: null, category: null };
    // Write buffer to a temp file so Tesseract can read it
    const tmpPath = join(baseDir, `ocr_tmp_${Date.now()}${extname(file.originalname || '.jpg')}`);
    try {
      writeFileSync(tmpPath, file.buffer);
      const result = await this.receiptsService.extractFromFile(tmpPath, file.mimetype);
      return result;
    } finally {
      try { unlinkSync(tmpPath); } catch (e: any) { this.logger.warn(`Failed to delete OCR temp file: ${tmpPath} — ${e?.message}`); }
    }
  }

  @Get(':filename')
  download(@Param('filename') filename: string, @Res() res: Response) {
    if (!/^\w[\w\-. ]*$/.test(filename)) {
      throw new BadRequestException('Invalid filename.');
    }
    // Check Receipts first, then Invoices
    for (const dir of [receiptsDir, invoicesDir]) {
      const filePath = resolve(dir, filename);
      if (!filePath.startsWith(resolve(dir))) throw new BadRequestException('Invalid filename.');
      if (existsSync(filePath)) return res.sendFile(filePath);
    }
    return res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'File not found.' }, meta: { timestamp: new Date().toISOString() } });
  }
}
