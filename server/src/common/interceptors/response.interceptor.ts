import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: null | { code: string; message: string; details?: any };
  meta: { timestamp: string; [key: string]: any };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the controller already returned a formatted response, pass through
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return data;
        }

        // Extract pagination meta if present
        let responseData = data;
        let meta: Record<string, any> = { timestamp: new Date().toISOString() };

        if (data && typeof data === 'object' && 'rows' in data && 'total' in data) {
          responseData = data.rows;
          meta = {
            ...meta,
            total: data.total,
            page: data.page,
            limit: data.limit,
          };
        }

        return {
          success: true,
          data: responseData,
          error: null,
          meta,
        };
      }),
    );
  }
}
