import { IsString, IsNumber, IsPositive, IsDateString, IsOptional, IsIn, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsIn(['income', 'expense'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  dateRecorded: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  receiptPath?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  contextType?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(['income', 'expense'])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsDateString()
  dateRecorded?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  receiptPath?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  contextType?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
