import { IsString, IsEmail, MinLength, MaxLength, IsOptional, IsIn, IsBoolean, IsArray } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Username must be 3-50 characters.' })
  @MaxLength(50)
  username: string;

  @IsEmail({}, { message: 'Valid email is required.' })
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;

  @IsOptional()
  role_id?: number;

  @IsOptional()
  manager_id?: number;

  @IsOptional()
  reporting_manager_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  clearance_level?: string;

  @IsOptional()
  @IsString()
  joining_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  house_apt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  user_status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  login_name?: string;

  @IsOptional()
  @IsArray()
  roles?: { roleId: number; isDefault: boolean }[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;

  @IsOptional()
  role_id?: number;

  @IsOptional()
  manager_id?: number;

  @IsOptional()
  reporting_manager_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  clearance_level?: string;

  @IsOptional()
  @IsString()
  joining_date?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  house_apt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  user_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  login_name?: string;

  @IsOptional()
  @IsString()
  date_of_birth?: string;

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
  @MaxLength(255)
  email: string;
}
