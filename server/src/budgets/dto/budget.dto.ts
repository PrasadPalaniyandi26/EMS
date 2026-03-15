import { IsOptional } from 'class-validator';

export class CreateBudgetDto {
  @IsOptional() categoryId?: number;
  @IsOptional() amount?: number;
  @IsOptional() allocated?: number;
  @IsOptional() periodMonth?: number;
  @IsOptional() periodYear?: number;
  @IsOptional() financial_year?: number;
  @IsOptional() name?: string;
  @IsOptional() department?: string;
  @IsOptional() owner_id?: number;
  @IsOptional() details?: string;
  @IsOptional() start_date?: string;
  @IsOptional() end_date?: string;
  @IsOptional() strict?: boolean;
  @IsOptional() rollover?: boolean;
}

export class UpdateBudgetDto extends CreateBudgetDto {
  @IsOptional() isActive?: boolean;
}
