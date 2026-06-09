import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  nickname?: string;
  birth_day?: string;
  birth_month?: string;
  birth_year?: string;
  marital?: string;
  province?: string;
  city?: string;
  nationality?: string;
  education?: string;
  employment?: string;
  height?: string;
  weight?: string;
  religion?: string;
  health?: string;

  // Step 3
  values_partner?: string[];
  partner_about?: string;
  hobbies_partner?: string[];

  // Step 4
  aboutme?: string;
  values_self?: string[];
  hobbies_self?: string[];

  // اختیاری
  password?: string;
  updated_at?: Date;
}
