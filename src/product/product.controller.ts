import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('public')
  getPublicProducts() {
    return {
      boost: [
        { id: 'boost_1', label: '۱ بوست', price: 19000, meta: { count: 1 } },
        { id: 'boost_5', label: '۵ بوست', price: 89000, meta: { count: 5 } },
        {
          id: 'boost_10',
          label: '۱۰ بوست',
          price: 169000,
          meta: { count: 10 },
        },
      ],
      credits: [
        {
          id: 'credits_10',
          label: '۱۰ اعتبار',
          price: 19000,
          meta: { amount: 10 },
        },
        {
          id: 'credits_50',
          label: '۵۰ اعتبار',
          price: 89000,
          meta: { amount: 50 },
        },
        {
          id: 'credits_100',
          label: '۱۰۰ اعتبار',
          price: 169000,
          meta: { amount: 100 },
        },
      ],
      vip: [
        { id: 'vip_month', label: '۱ماهه', price: 19000 },
        { id: 'vip_3month', label: '۳ماهه', price: 89000 },
        { id: 'vip_1year', label: '۱ساله', price: 169000 },
      ],
    };
  }

  @Post('payments/start')
  async startPayment(@Body() body: { productId: string }) {
    // TODO: پیاده‌سازی واقعی با درگاه پرداخت
    return { paymentUrl: 'https://gateway.example.com/pay/...' };
  }
}
