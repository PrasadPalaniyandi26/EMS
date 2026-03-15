import { IsString, IsEmail, MinLength, IsOptional, IsIn, IsInt, IsBoolean, IsArray } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Username must be 3-50 characters.' })
  username: string;

  @IsEmail({}, { message: 'Valid email is required.' })
  email: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  role_id?: number;

  @IsOptional()
  roleId?: number;

  @IsOptional()
  manager_id?: number;

  @IsOptional()
  reporting_manager_id?: number;

  @IsOptional()
  managerId?: number;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  clearance_level?: string;

  @IsOptional()
  @IsString()
  joining_date?: string;

  @IsOptional()
  @IsString()
  contact_no?: string;

  @IsOptional()
  @IsString()
  house_apt?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postal_code?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  user_status?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  roles?: { roleId: number; isDefault: boolean }[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  role_id?: number;

  @IsOptional()
  roleId?: number;

  @IsOptional()
  manager_id?: number;

  @IsOptional()
  reporting_manager_id?: number;

  @IsOptional()
  managerId?: number;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  clearance_level?: string;

  @IsOptional()
  @IsString()
  joining_date?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  contact_no?: string;

  @IsOptional()
  @IsString()
  house_apt?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postal_code?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  user_status?: string;

  @IsOptional()
  @IsArray()
  roles?: { roleId: number; isDefault: boolean }[];
}

export class UpdateCurrencyDto {
  @IsString()
  @IsIn(['USD', 'GBP', 'EUR', 'INR'], { message: 'Currency must be USD, GBP, EUR, or INR.' })
  currency: string;
}

export class UpdateEmailDto {
  @IsEmail({}, { message: 'Valid email is required.' })
  email: string;
}
