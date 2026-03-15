import { Controller, Post, Get, Param, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { join, extname, resolve } from 'path';
import { existsSync } from 'fs';
import { ApiTags } from '@nestjs/swagger';

const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '..', '..', 'uploads');

@ApiTags('receipts')
@Controller('v1/receipts')
@UseGuards(AuthGuard('jwt'))
export class ReceiptsController {
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: uploadDir,
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
  upload(@UploadedFile() file: any) {
    if (!file) return { error: 'No file uploaded or file type not allowed.' };
    return { filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Get(':filename')
  download(@Param('filename') filename: string, @Res() res: Response) {
    // Reject filenames with path separators or non-safe characters
    if (!/^[\w\-. ]+$/.test(filename)) {
      throw new BadRequestException('Invalid filename.');
    }
    // Resolve and verify the file is inside the upload directory (prevents ../ traversal)
    const filePath = resolve(uploadDir, filename);
    if (!filePath.startsWith(resolve(uploadDir))) {
      throw new BadRequestException('Invalid filename.');
    }
    if (!existsSync(filePath)) {
      return res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'File not found.' }, meta: { timestamp: new Date().toISOString() } });
    }
    return res.sendFile(filePath);
  }
}
