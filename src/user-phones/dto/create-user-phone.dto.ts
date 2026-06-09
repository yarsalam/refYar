import { IsNotEmpty, IsPhoneNumber, IsOptional, IsIn } from 'class-validator';

export class CreateUserPhoneDto {
  @IsNotEmpty()
  @IsPhoneNumber('IR')
  phone: string;

  @IsOptional()
  @IsIn(['whatsapp', 'telegram'])
  channel?: 'whatsapp' | 'telegram';
}
