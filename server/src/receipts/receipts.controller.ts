import { Controller, Post, Get, Param, Res, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import type { Response, Request } from 'express';
import { join, extname, resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { ApiTags } from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { sniffExt, TYPE_BY_EXT } from '../common/helpers/attachments';

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
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: any, @CurrentUser('id') userId: number, @Query('type') type?: string) {
    const ext = file ? sniffExt(file.buffer) : null;
    if (!ext) throw new BadRequestException('Choose a PDF, JPEG, PNG, GIF or WebP file.');
    // The name records who uploaded it: until it is on a record, only that person may use or open it
    const filename = `u${userId}-${randomUUID()}${ext}`;
    // ?type=invoice → Invoices folder; default → Receipts folder
    writeFileSync(join(type === 'invoice' ? invoicesDir : receiptsDir, filename), file.buffer);
    return { filename, originalName: file.originalname, size: file.size, folder: type === 'invoice' ? 'Invoices' : 'Receipts' };
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
    const tmpPath = join(baseDir, `ocr_tmp_${randomUUID()}${sniffExt(file.buffer) ?? '.bin'}`);
    try {
      writeFileSync(tmpPath, file.buffer);
      const result = await this.receiptsService.extractFromFile(tmpPath, file.mimetype);
      return result;
    } finally {
      try { unlinkSync(tmpPath); } catch (e: any) { this.logger.warn(`Failed to delete OCR temp file: ${tmpPath} — ${e?.message}`); }
    }
  }

  @Get(':filename')
  async download(@Param('filename') filename: string, @CurrentUser('id') userId: number, @Res() res: Response) {
    if (!/^\w[\w\-. ]*$/.test(filename)) {
      throw new BadRequestException('Invalid filename.');
    }
    const notFound = () => res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'File not found.' }, meta: { timestamp: new Date().toISOString() } });
    if (!(await this.receiptsService.mayOpen(filename, userId))) return notFound();
    // Check Receipts first, then Invoices
    for (const dir of [receiptsDir, invoicesDir]) {
      const filePath = resolve(dir, filename);
      if (!filePath.startsWith(resolve(dir))) throw new BadRequestException('Invalid filename.');
      if (existsSync(filePath)) {
        // Files stored before the type was checked are only shown if their ending is one of the allowed types
        const type = TYPE_BY_EXT[extname(filename).toLowerCase()];
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', type ?? 'application/octet-stream');
        if (!type) res.setHeader('Content-Disposition', 'attachment');
        return res.sendFile(filePath);
      }
    }
    return notFound();
  }
}
