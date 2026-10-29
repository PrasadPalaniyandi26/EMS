import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

// Stable codes for exceptions thrown with a plain message, e.g. new HttpException('...', HttpStatus.FORBIDDEN)
const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'UNPROCESSABLE',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error.';
    let code = 'INTERNAL_ERROR';
    let details: any = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
        code = STATUS_CODES[statusCode] || 'HTTP_ERROR';
      } else if (typeof exResponse === 'object') {
        const resp = exResponse as any;
        message = resp.message || exception.message;
        code = resp.code || resp.error || 'HTTP_ERROR';
        details = resp.details || null;

        // class-validator errors come as message[]
        if (Array.isArray(resp.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed.';
          details = resp.message.map((m: string) => ({ message: m }));
        }
      }
    } else if (exception?.code === 'P2002') {
      // Prisma unique constraint
      statusCode = HttpStatus.CONFLICT;
      message = 'This record already exists and must be unique.';
      code = 'DUPLICATE_RECORD';
    } else if (exception?.code === 'P2003') {
      // Prisma foreign key constraint
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'A required related record was not found.';
      code = 'INVALID_RELATION';
    } else if (exception?.code === 'P2025') {
      // Prisma record not found
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Record not found.';
      code = 'NOT_FOUND';
    } else {
      message = exception?.message || 'Internal server error.';
    }

    // Log based on severity
    if (statusCode >= 500) {
      this.logger.error(`${request.method} ${request.url}: ${message}`, exception?.stack);
    } else if (statusCode === 401) {
      this.logger.debug(`${request.method} ${request.url}: ${message}`);
    } else {
      this.logger.warn(`${request.method} ${request.url}: ${message}`);
    }

    response.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
